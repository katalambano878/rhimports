import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { verifyAuth } from '@/lib/auth';
import { withTransaction } from '@/lib/db/pool';
import { evaluateCoupon, normalizeCouponCode } from '@/app/api/storefront/coupons/validate-coupon';
import { isPreorderProduct } from '@/app/api/payment/_lib/order-charge';

export const dynamic = 'force-dynamic';

const supabase = createServerSupabase('service');

const CREATE_RATE_LIMIT = { maxRequests: 12, windowSeconds: 60 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_NUMBER_RE = /^ORD-\d+-\d+$/;
const TRACKING_RE = /^SLI-[A-Z0-9]{4,12}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_QTY = 999;
const DELIVERY_METHODS = new Set(['doorstep', 'accra', 'outside-accra', 'pickup']);
const PAYMENT_METHODS = new Set(['hubtel', 'moolre']);

/**
 * Creates a storefront order. Everything that decides money is computed here
 * from the database; the browser's prices and totals are ignored (the client
 * total is only compared, to report `priceChanged`).
 *
 * Body: { orderNumber?, trackingNumber?, email, phone, shippingData,
 *         deliveryMethod?, paymentMethod?, total?, couponCode?,
 *         items: [{ id, variantId?, variant?, quantity, image?, name? }] }
 *   id        product uuid or slug
 *   variantId product_variants.id (preferred); `variant` (the cart's label,
 *             e.g. "M / Red") is matched to a variant when no id is sent.
 * Auth:   optional `Authorization: Bearer <token>` — the ONLY source of user_id.
 * 201 →   { id, order_number, subtotal, discount_total, total, priceChanged }
 * 400 →   { error, unavailable? , coupon_invalid?, coupon? }
 *
 * Delivery is quoted by the store after the order ("We will contact you with
 * the delivery cost"), so shipping_total is 0; there is no tax.
 */
interface IncomingItem {
    id: string;
    name?: string;
    variant?: string | null;
    variantId?: string | null;
    quantity: number;
    image?: string | null;
}

interface CreateOrderPayload {
    orderNumber?: string;
    trackingNumber?: string;
    email: string;
    phone: string;
    shippingData: Record<string, unknown> & {
        firstName?: string;
        lastName?: string;
    };
    deliveryMethod?: string;
    paymentMethod?: string;
    total?: number;
    couponCode?: string | null;
    items: IncomingItem[];
}

function badRequest(message: string, extra?: Record<string, unknown>) {
    return NextResponse.json({ error: message, ...(extra || {}) }, { status: 400 });
}

function serverError(message = 'We could not place your order. Please try again.') {
    return NextResponse.json({ error: message }, { status: 500 });
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function cleanText(v: unknown, max: number): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
}

function cleanImage(v: unknown): string | null {
    const t = cleanText(v, 1000);
    if (!t) return null;
    return /^https:\/\//i.test(t) || t.startsWith('/') ? t : null;
}

/** Only plain string fields of the shipping form are stored. */
function cleanShipping(raw: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    let n = 0;
    for (const [k, v] of Object.entries(raw)) {
        if (n >= 30) break;
        if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
        if (typeof v === 'string') out[k] = v.trim().slice(0, 500);
        else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
        else continue;
        n++;
    }
    return out;
}

function randomTracking(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return `SLI-${s}`;
}

type ProductRow = { id: string; name: string; slug: string; price: number | string; status?: string; moq?: number | null; metadata?: any };
type VariantRow = { id: string; product_id: string; name: string; price: number | string; option1?: string | null; option2?: string | null; option3?: string | null };

/** The cart's label is the chosen option values joined with " / " (ProductDetailClient). */
function variantByLabel(variants: VariantRow[], label: string): VariantRow | null {
    const norm = (s: string) => s.trim().toLowerCase();
    const want = norm(label);
    return (
        variants.find((v) => norm(v.name || '') === want) ||
        variants.find((v) => norm([v.option1, v.option2, v.option3].filter(Boolean).join(' / ')) === want) ||
        null
    );
}

export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rl = checkRateLimit(`orders-create:${clientId}`, CREATE_RATE_LIMIT);
        if (!rl.success) {
            return NextResponse.json({ error: 'Too many checkout attempts. Please wait a moment.' }, { status: 429 });
        }

        let body: CreateOrderPayload;
        try {
            body = (await req.json()) as CreateOrderPayload;
        } catch {
            return badRequest('Invalid JSON body');
        }

        // --- Basic validation ------------------------------------------------
        if (!body || typeof body !== 'object') return badRequest('Missing body');
        const orderNumber =
            typeof body.orderNumber === 'string' && ORDER_NUMBER_RE.test(body.orderNumber)
                ? body.orderNumber
                : `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        if (!body.email || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
            return badRequest('Invalid email');
        }
        if (!body.phone || typeof body.phone !== 'string' || body.phone.replace(/\D/g, '').length < 9 || body.phone.length > 32) {
            return badRequest('Invalid phone');
        }
        if (!body.shippingData || typeof body.shippingData !== 'object' || Array.isArray(body.shippingData)) {
            return badRequest('Missing shipping details');
        }
        if (JSON.stringify(body.shippingData).length > 5000) {
            return badRequest('Shipping details are too long');
        }
        if (!Array.isArray(body.items) || body.items.length === 0) {
            return badRequest('Cart is empty');
        }
        if (body.items.length > 200) {
            return badRequest('Too many items');
        }
        for (const item of body.items) {
            if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200) {
                return badRequest('Invalid item in cart');
            }
            const q = Number(item.quantity);
            if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) {
                return badRequest(`Quantity must be a whole number from 1 to ${MAX_QTY}.`);
            }
        }
        const email = body.email.trim();
        const phone = body.phone.trim();
        const shippingData = cleanShipping(body.shippingData);
        const trackingNumber =
            typeof body.trackingNumber === 'string' && TRACKING_RE.test(body.trackingNumber) ? body.trackingNumber : randomTracking();
        const deliveryMethod =
            typeof body.deliveryMethod === 'string' && DELIVERY_METHODS.has(body.deliveryMethod) ? body.deliveryMethod : 'doorstep';
        const paymentMethod =
            typeof body.paymentMethod === 'string' && PAYMENT_METHODS.has(body.paymentMethod) ? body.paymentMethod : 'hubtel';

        // --- Who is ordering: ONLY a verified bearer token sets user_id -------
        let userId: string | null = null;
        let userEmail: string | null = null;
        if (req.headers.get('authorization')) {
            try {
                const auth = await verifyAuth(req);
                if (auth.authenticated && auth.user?.id && UUID_RE.test(String(auth.user.id))) {
                    userId = String(auth.user.id);
                    userEmail = typeof auth.user.email === 'string' ? auth.user.email : null;
                }
            } catch {
                /* invalid/expired token: check out as a guest */
            }
        }

        // --- Resolve products (uuid or slug) ---------------------------------
        const productById = new Map<string, ProductRow>();
        const directIds = Array.from(new Set(body.items.filter((i) => UUID_RE.test(i.id)).map((i) => i.id.toLowerCase())));
        if (directIds.length > 0) {
            const { data: prods, error } = await supabase
                .from('products')
                .select('id, name, slug, price, status, moq, metadata')
                .in('id', directIds);
            if (error) {
                console.error('[OrdersCreate] product lookup failed:', error.message);
                return serverError();
            }
            for (const p of (prods || []) as ProductRow[]) productById.set(p.id, p);
        }

        const slugToId = new Map<string, string>();
        const slugs = Array.from(new Set(body.items.filter((i) => !UUID_RE.test(i.id)).map((i) => i.id.trim())));
        for (const slug of slugs) {
            if (!SLUG_RE.test(slug)) {
                return badRequest(`Product not found: ${slug.slice(0, 60)}`, { unavailable: [slug.slice(0, 60)] });
            }
            const { data: prod, error } = await supabase
                .from('products')
                .select('id, name, slug, price, status, moq, metadata')
                .eq('slug', slug)
                .maybeSingle();
            if (error) {
                console.error('[OrdersCreate] slug lookup failed:', error.message);
                return serverError();
            }
            if (!prod) return badRequest(`Product not found: ${slug.slice(0, 60)}`, { unavailable: [slug.slice(0, 60)] });
            slugToId.set(slug, (prod as ProductRow).id);
            productById.set((prod as ProductRow).id, prod as ProductRow);
        }
        const productIdOf = (item: IncomingItem) => (UUID_RE.test(item.id) ? item.id.toLowerCase() : slugToId.get(item.id.trim()));

        // --- Reject unavailable (draft / archived / unknown) products --------
        const unavailable: string[] = [];
        for (const item of body.items) {
            const pid = productIdOf(item);
            const prod = pid ? productById.get(pid) : undefined;
            if (!prod || prod.status !== 'active') {
                unavailable.push(cleanText(item.name, 120) || item.id.slice(0, 60));
            }
        }
        if (unavailable.length > 0) {
            return badRequest(
                `Some items are no longer available: ${unavailable.join(', ')}. Please remove them from your cart and try again.`,
                { unavailable },
            );
        }

        // --- Resolve variants --------------------------------------------------
        const productIds = Array.from(productById.keys());
        const variantsByProduct = new Map<string, VariantRow[]>();
        {
            const { data: vars, error } = await supabase
                .from('product_variants')
                .select('id, product_id, name, price, option1, option2, option3')
                .in('product_id', productIds);
            if (error) {
                console.error('[OrdersCreate] variant lookup failed:', error.message);
                return serverError();
            }
            for (const v of (vars || []) as VariantRow[]) {
                const list = variantsByProduct.get(v.product_id) || [];
                list.push(v);
                variantsByProduct.set(v.product_id, list);
            }
        }

        type Line = {
            productId: string;
            product: ProductRow;
            variant: VariantRow | null;
            variantLabel: string | null;
            qty: number;
            unit: number;
            total: number;
            image: string | null;
        };
        const lines: Line[] = [];
        for (const item of body.items) {
            const productId = productIdOf(item)!;
            const product = productById.get(productId)!;
            const pvs = variantsByProduct.get(productId) || [];
            let variant: VariantRow | null = null;
            if (typeof item.variantId === 'string' && UUID_RE.test(item.variantId)) {
                variant = pvs.find((v) => v.id.toLowerCase() === item.variantId!.toLowerCase()) || null;
                if (!variant) {
                    return badRequest(`An option you chose for ${product.name} is no longer available. Please review your cart.`, {
                        unavailable: [product.name],
                    });
                }
            } else {
                const label = cleanText(item.variant, 200);
                if (label) {
                    variant = variantByLabel(pvs, label);
                    if (!variant && pvs.length > 0) {
                        return badRequest(`An option you chose for ${product.name} is no longer available. Please review your cart.`, {
                            unavailable: [product.name],
                        });
                    }
                }
            }

            const qty = Number(item.quantity);
            const moq = Math.max(1, Number(product.moq) || 1);
            if (qty < moq) {
                return badRequest(`${product.name} has a minimum order of ${moq}. Please update your cart.`);
            }
            const unit = Number(variant ? variant.price : product.price);
            if (!Number.isFinite(unit) || unit < 0) {
                console.error('[OrdersCreate] missing server price for product', productId);
                return serverError('We could not price an item in your cart. Please try again.');
            }
            lines.push({
                productId,
                product,
                variant,
                variantLabel: cleanText(item.variant, 200) || variant?.name || null,
                qty,
                unit: round2(unit),
                total: round2(unit * qty),
                image: cleanImage(item.image),
            });
        }

        const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
        if (subtotal <= 0) return badRequest('Your cart total is zero. Please review your cart.');

        // --- Coupon ------------------------------------------------------------
        let discount = 0;
        let couponCode: string | null = null;
        const rawCoupon = normalizeCouponCode(body.couponCode);
        if (rawCoupon) {
            const ev = await evaluateCoupon(rawCoupon, subtotal, { mode: 'checkout', email });
            if (!ev.valid) {
                return badRequest(ev.message, { coupon_invalid: true, coupon: ev });
            }
            discount = ev.discount;
            couponCode = ev.code;
        }
        const shippingTotal = 0; // quoted by the store after the order
        const taxTotal = 0;
        const total = round2(Math.max(0, subtotal - discount + shippingTotal + taxTotal));
        const clientTotal = Number(body.total);
        const priceChanged = !Number.isFinite(clientTotal) || Math.abs(clientTotal - total) > 0.01;

        // --- Build the order row (same shape the checkout page wrote) ---------
        const firstName = cleanText(shippingData.firstName, 100);
        const lastName = cleanText(shippingData.lastName, 100);

        const orderRow = {
            order_number: orderNumber,
            user_id: userId,
            email,
            phone,
            status: 'pending',
            payment_status: 'pending',
            currency: 'GHS',
            subtotal,
            tax_total: taxTotal,
            shipping_total: shippingTotal,
            discount_total: discount,
            total,
            shipping_method: deliveryMethod,
            payment_method: paymentMethod,
            shipping_address: shippingData,
            billing_address: shippingData,
            metadata: {
                guest_checkout: !userId,
                first_name: firstName,
                last_name: lastName,
                tracking_number: trackingNumber,
                payment_method: paymentMethod,
                server_priced: true,
                ...(couponCode ? { coupon_code: couponCode } : {}),
                ...(priceChanged && Number.isFinite(clientTotal) ? { client_total_attempt: clientTotal } : {}),
            },
        };

        // --- Insert order + items in one transaction ---------------------------
        let createdOrder: { id: string; order_number: string };
        try {
            createdOrder = await withTransaction(async () => {
                const { data: order, error: orderError } = await supabase
                    .from('orders')
                    .insert([orderRow])
                    .select('id, order_number')
                    .single();
                if (orderError || !order) throw Object.assign(new Error(`order insert: ${orderError?.message || 'no row'}`), { code: orderError?.code });

                const orderItems = lines.map((l) => ({
                    order_id: order.id,
                    product_id: l.productId,
                    variant_id: l.variant?.id || null,
                    product_name: l.product.name,
                    variant_name: l.variantLabel,
                    quantity: l.qty,
                    unit_price: l.unit,
                    total_price: l.total,
                    metadata: {
                        image: l.image,
                        slug: l.product.slug || null,
                        preorder_shipping: l.product.metadata?.preorder_shipping || null,
                        is_preorder: isPreorderProduct(l.product.metadata),
                    },
                }));
                const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
                if (itemsError) throw new Error(`order_items insert: ${itemsError.message}`);
                return order as { id: string; order_number: string };
            });
        } catch (e: any) {
            console.error('[OrdersCreate] create failed:', e?.message || e);
            if (e?.code === '23505') {
                return NextResponse.json({ error: 'This order was already placed. Please refresh and try again.' }, { status: 409 });
            }
            return serverError();
        }

        // --- Customer record (best-effort) ---------------------------------
        // upsert_customer_from_order overwrites name/address/user_id of an
        // existing customer matched by email or phone. Only let it run for a
        // new customer, or when the signed-in user owns the matched record;
        // otherwise leave the existing record alone (order stats are added by
        // update_customer_stats when the order is paid).
        try {
            const findOne = async (col: string, val: string) => {
                if (!val) return null;
                const { data } = await supabase.from('customers').select('id, email, user_id').eq(col, val).limit(1);
                return ((data || [])[0] as { id: string; email: string; user_id: string | null }) || null;
            };
            const existing =
                (await findOne('email', email)) ||
                (await findOne('secondary_email', email)) ||
                (await findOne('phone', phone)) ||
                (await findOne('secondary_phone', phone));

            const ownsExisting =
                !!existing &&
                !!userId &&
                (existing.user_id === userId ||
                    (!existing.user_id && !!userEmail && existing.email?.toLowerCase() === userEmail.toLowerCase()));

            if (!existing || ownsExisting) {
                const fullName = `${firstName || ''} ${lastName || ''}`.trim();
                const { error } = await supabase.rpc('upsert_customer_from_order', {
                    p_email: email,
                    p_phone: phone,
                    p_full_name: fullName,
                    p_first_name: firstName,
                    p_last_name: lastName,
                    p_user_id: userId,
                    p_address: shippingData,
                });
                if (error) console.error('[OrdersCreate] upsert_customer_from_order failed (non-fatal):', error.message);
            }
        } catch (custErr: any) {
            console.error('[OrdersCreate] customer upsert failed (non-fatal):', custErr?.message || custErr);
        }

        return NextResponse.json(
            {
                id: createdOrder.id,
                order_number: createdOrder.order_number,
                subtotal,
                discount_total: discount,
                total,
                priceChanged,
            },
            { status: 201 },
        );
    } catch (err: any) {
        console.error('[OrdersCreate] unexpected error:', err?.message, err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
