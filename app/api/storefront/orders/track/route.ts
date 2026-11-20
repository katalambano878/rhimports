import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { query } from '@/lib/db/pool';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { normalizeGhPhone } from '@/lib/hubtel';
import { maskEmail, maskPhone, isPlaceholder } from '@/app/api/storefront/_lib/mask';

export const dynamic = 'force-dynamic';

const supabase = createServerSupabase('service');

const TRACK_RATE_LIMIT = { maxRequests: 10, windowSeconds: 60 };
const ORDER_NUMBER_RE = /^ORD-\d+-\d+$/i;
const TRACKING_RE = /^SLI-[A-Z0-9]{4,12}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_SELECT = `
    id, order_number, status, payment_status, subtotal, discount_total, shipping_total, total,
    currency, email, phone, created_at, updated_at, shipping_address, metadata,
    order_items ( id, product_name, variant_name, quantity, unit_price, total_price, metadata )
`;

/**
 * Order tracking for customers.
 *
 * Body: { orderNumber, email?, phone? }
 *   orderNumber — the ORD-… order number (or the SLI-… tracking number from
 *                 the confirmation SMS/email); required.
 *   email or phone — must match the order; at least one is required.
 *
 * 200 → { orders: [order] } with status, dates, items (name, qty, price,
 * image), totals and a trimmed address (first name, city, region). Email and
 * phone are masked. 404 when nothing matches (same answer for a wrong number
 * and a wrong contact).
 */
function notFound() {
    return NextResponse.json(
        { error: 'No order found. Check your order number and the email or phone you used, then try again.' },
        { status: 404 },
    );
}

function phonesMatch(stored: string | null | undefined, input: string): boolean {
    const a = normalizeGhPhone(stored);
    const b = normalizeGhPhone(input);
    if (a.length < 9 || b.length < 9) return false;
    return a.slice(-9) === b.slice(-9);
}

function publicOrder(order: any) {
    const addr = (order.shipping_address || {}) as Record<string, any>;
    const meta = (order.metadata || {}) as Record<string, any>;
    return {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        subtotal: order.subtotal,
        discount_total: order.discount_total,
        shipping_total: order.shipping_total,
        total: order.total,
        currency: order.currency,
        created_at: order.created_at,
        updated_at: order.updated_at,
        email: isPlaceholder(order.email) ? null : maskEmail(order.email),
        phone: maskPhone(order.phone || addr.phone),
        shipping_address: {
            firstName: addr.firstName ?? null,
            city: addr.city ?? null,
            region: addr.region ?? null,
        },
        metadata: {
            tracking_number: meta.tracking_number ?? null,
            payment_verified_at: meta.payment_verified_at ?? null,
        },
        order_items: (order.order_items || []).map((item: any) => ({
            id: item.id,
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
    };
}

export async function POST(request: Request) {
    try {
        const rateLimitResult = checkRateLimit(`track:${getClientIdentifier(request)}`, TRACK_RATE_LIMIT);
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429, headers: { 'X-RateLimit-Reset': rateLimitResult.resetIn.toString() } },
            );
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }
        const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : '';
        const email = typeof body?.email === 'string' ? body.email.trim() : '';
        const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';

        if (!orderNumber || (!email && !phone)) {
            return NextResponse.json(
                { error: 'Enter your order number (or tracking number) and the email or phone number you ordered with.' },
                { status: 400 },
            );
        }
        if (!ORDER_NUMBER_RE.test(orderNumber) && !TRACKING_RE.test(orderNumber) && !UUID_RE.test(orderNumber)) {
            return NextResponse.json({ error: 'Invalid order or tracking number' }, { status: 400 });
        }
        if (email && (email.length > 254 || !EMAIL_RE.test(email))) {
            return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }
        if (phone && phone.replace(/\D+/g, '').length < 9) {
            return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
        }

        let rows: any[] = [];
        if (TRACKING_RE.test(orderNumber)) {
            // JSON path filters go through SQL (the data client only takes plain columns).
            const { rows: ids } = await query<{ id: string }>(
                `SELECT id FROM orders WHERE metadata->>'tracking_number' = $1 LIMIT 5`,
                [orderNumber.toUpperCase()],
            );
            if (ids.length > 0) {
                const { data, error } = await supabase.from('orders').select(ORDER_SELECT).in('id', ids.map((r) => r.id));
                if (error) throw new Error(error.message);
                rows = data || [];
            }
        } else {
            const column = UUID_RE.test(orderNumber) ? 'id' : 'order_number';
            const value = UUID_RE.test(orderNumber) ? orderNumber : orderNumber.toUpperCase();
            const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq(column, value).limit(5);
            if (error) throw new Error(error.message);
            rows = data || [];
        }
        if (rows.length === 0) return notFound();

        const matches = rows.filter((order) => {
            const emailOk = !!email && !!order.email && !isPlaceholder(order.email) && order.email.toLowerCase() === email.toLowerCase();
            const shippingPhone = (order.shipping_address as any)?.phone;
            const phoneOk = !!phone && (phonesMatch(order.phone, phone) || phonesMatch(shippingPhone, phone));
            return emailOk || phoneOk;
        });
        if (matches.length === 0) return notFound();

        return NextResponse.json({ orders: matches.slice(0, 1).map(publicOrder) });
    } catch (error: any) {
        console.error('[Track] Error:', error?.message || error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
