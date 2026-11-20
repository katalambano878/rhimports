/**
 * Shared, server-authoritative pricing + access checks for the payment routes
 * (Hubtel and Moolre init, verify, callbacks).
 *
 * Charge for an order = Σ round2(current catalogue price × qty)
 *                       − coupon discount (re-applied from metadata.coupon_code)
 * where the price is the variant price (by variant_id, else by variant name),
 * else the product price. Delivery is quoted later (shipping 0) and there is
 * no tax. Nothing written by the browser is used.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { verifyAuth } from '@/lib/auth';
import { withTransaction } from '@/lib/db/pool';
import { normalizeGhPhone } from '@/lib/hubtel';
import { roundMoney } from '@/lib/hubtel-order';
import { evaluateCoupon } from '@/app/api/storefront/coupons/validate-coupon';

const supabase = createServerSupabase('service');

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ORDER_PAYMENT_SELECT =
    'id, order_number, user_id, total, subtotal, discount_total, email, phone, status, payment_status, shipping_address, metadata';

export const round2 = roundMoney;

/** Preorder products (metadata.is_preorder or metadata.preorder_shipping) sell like continue_selling. */
export function isPreorderProduct(metadata: unknown): boolean {
    const m = metadata && typeof metadata === 'object' ? (metadata as Record<string, any>) : {};
    return m.is_preorder === true || m.is_preorder === 'true' || (typeof m.preorder_shipping === 'string' && m.preorder_shipping.trim() !== '');
}

/** Canonical public base URL (no trailing slash). */
export function siteBaseUrl(fallbackOrigin?: string): string {
    return (process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin || '').trim().replace(/\/+$/, '');
}

export interface ChargeItem {
    id: string;
    product_id: string | null;
    variant_id: string | null;
    variant_name?: string | null;
    quantity: number;
    unit_price?: number | null;
    total_price?: number | null;
    metadata?: Record<string, any> | null;
}

export interface ChargeLine {
    id: string;
    quantity: number;
    unit: number;
    total: number;
    variantId: string | null;
}

export interface OrderCharge {
    lines: ChargeLine[];
    /** order_items ids with no catalogue price (deleted / inactive product or variant, bad quantity). */
    missing: string[];
    subtotal: number;
    discount: number;
    total: number;
    /** Coupon code still applied (null when none or it no longer applies). */
    couponCode: string | null;
    couponMessage: string | null;
}

/**
 * Current catalogue unit price per order item id (variant_id, else the
 * variant with that name on the product, else the product). Products that are
 * no longer active have no price.
 */
export async function catalogUnitPrices(
    items: ChargeItem[],
): Promise<Map<string, { unit: number; variantId: string | null }>> {
    const out = new Map<string, { unit: number; variantId: string | null }>();
    const productIds = Array.from(new Set(items.map((i) => i.product_id).filter((v): v is string => !!v && UUID_RE.test(v))));
    if (productIds.length === 0) return out;

    const { data: products, error: pErr } = await supabase
        .from('products')
        .select('id, price, status')
        .in('id', productIds);
    if (pErr) throw new Error(`catalogue products: ${pErr.message}`);
    const { data: variants, error: vErr } = await supabase
        .from('product_variants')
        .select('id, product_id, name, price')
        .in('product_id', productIds);
    if (vErr) throw new Error(`catalogue variants: ${vErr.message}`);

    const productById = new Map<string, any>((products || []).map((p: any) => [p.id, p]));
    const variantsByProduct = new Map<string, any[]>();
    for (const v of (variants || []) as any[]) {
        const list = variantsByProduct.get(v.product_id) || [];
        list.push(v);
        variantsByProduct.set(v.product_id, list);
    }

    for (const it of items) {
        if (!it.product_id) continue;
        const product = productById.get(it.product_id);
        if (!product || product.status !== 'active') continue;
        const pvs = variantsByProduct.get(it.product_id) || [];
        let variant: any = null;
        if (it.variant_id) {
            variant = pvs.find((v) => v.id === it.variant_id) || null;
            if (!variant) continue; // the chosen option no longer exists
        } else if (it.variant_name) {
            variant = pvs.find((v) => v.name === it.variant_name) || null;
        }
        const unit = Number(variant ? variant.price : product.price);
        if (!Number.isFinite(unit) || unit < 0) continue;
        out.set(it.id, { unit: round2(unit), variantId: variant?.id || it.variant_id || null });
    }
    return out;
}

/** Server price for the given order lines (see file header). */
export async function computeOrderCharge(
    order: { metadata?: Record<string, any> | null; email?: string | null },
    items: ChargeItem[],
): Promise<OrderCharge> {
    const meta = order.metadata || {};
    const prices = await catalogUnitPrices(items);

    const lines: ChargeLine[] = [];
    const missing: string[] = [];
    for (const it of items) {
        const qty = Number(it.quantity);
        const price = prices.get(it.id);
        if (!price || !Number.isInteger(qty) || qty <= 0) {
            missing.push(it.id);
            continue;
        }
        lines.push({ id: it.id, quantity: qty, unit: price.unit, total: round2(price.unit * qty), variantId: price.variantId });
    }
    const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));

    let discount = 0;
    let couponCode: string | null = null;
    let couponMessage: string | null = null;
    if (typeof meta.coupon_code === 'string' && meta.coupon_code) {
        const ev = await evaluateCoupon(meta.coupon_code, subtotal, { mode: 'payment' });
        if (ev.valid) {
            discount = ev.discount;
            couponCode = ev.code;
        } else {
            couponMessage = ev.message;
        }
    }

    return {
        lines,
        missing,
        subtotal,
        discount,
        total: round2(Math.max(0, subtotal - discount)),
        couponCode,
        couponMessage,
    };
}

/**
 * Amounts a confirmed payment for this order may be checked against: the
 * charge recomputed now, plus the server amount recorded when the payment was
 * opened (prices can change between opening checkout and paying). The stored
 * order total counts only when no server amount was recorded (payment links
 * opened before this deploy).
 */
export async function expectedChargeAmounts(order: {
    id: string;
    total?: number | string | null;
    email?: string | null;
    metadata?: Record<string, any> | null;
}): Promise<number[]> {
    const out: number[] = [];
    try {
        const { data: items, error } = await supabase
            .from('order_items')
            .select('id, product_id, variant_id, variant_name, quantity, metadata')
            .eq('order_id', order.id);
        if (!error && items && items.length > 0) {
            const charge = await computeOrderCharge(order, items as ChargeItem[]);
            if (charge.missing.length === 0 && charge.total > 0) out.push(charge.total);
        }
    } catch (e: any) {
        console.error('[OrderCharge] recompute failed:', e?.message || e);
    }
    const recorded = Number(order.metadata?.payment_server_amount);
    if (Number.isFinite(recorded) && recorded > 0) {
        out.push(round2(recorded));
    } else {
        const legacyTotal = Number(order.total);
        if (Number.isFinite(legacyTotal) && legacyTotal > 0) out.push(round2(legacyTotal));
    }
    return out;
}

/** True when `paid` covers at least one of the expected amounts (1 pesewa slack). */
export function paidCoversExpected(paid: number | null, expected: number[]): boolean {
    if (paid == null || !Number.isFinite(paid) || expected.length === 0) return false;
    return expected.some((e) => paid + 0.01 >= e);
}

function digitsTail(input: unknown): string {
    const n = normalizeGhPhone(typeof input === 'string' ? input : '');
    return n.length >= 9 ? n.slice(-9) : '';
}

/**
 * Who may open a payment for an order (and so trigger re-pricing / removal of
 * out-of-stock lines): any ONE of
 *   (a) body customerEmail/email or phone matching the order,
 *   (b) body orderUuid (or a uuid orderId) equal to the order's id,
 *   (c) a bearer token for the order's owner or a staff member.
 */
export async function callerMayPayOrder(
    req: Request,
    order: { id: string; email?: string | null; phone?: string | null; user_id?: string | null; shipping_address?: any },
    body: Record<string, any>,
): Promise<boolean> {
    const email = typeof body.customerEmail === 'string' ? body.customerEmail : typeof body.email === 'string' ? body.email : '';
    if (email && order.email && email.trim().toLowerCase() === String(order.email).trim().toLowerCase()) return true;

    const phoneTail = digitsTail(body.phone);
    if (phoneTail) {
        const stored = [order.phone, order.shipping_address?.phone].map(digitsTail).filter(Boolean);
        if (stored.includes(phoneTail)) return true;
    }

    const uuid = typeof body.orderUuid === 'string' ? body.orderUuid.trim() : typeof body.orderId === 'string' ? body.orderId.trim() : '';
    if (uuid && UUID_RE.test(uuid) && uuid.toLowerCase() === String(order.id).toLowerCase()) return true;

    if (req.headers.get('authorization')) {
        try {
            const auth = await verifyAuth(req);
            if (auth.authenticated && auth.user?.id) {
                if (order.user_id && auth.user.id === order.user_id) return true;
                const staff = await verifyAuth(req, { requireRole: ['admin', 'staff'] });
                if (staff.authenticated) return true;
            }
        } catch {
            /* not signed in */
        }
    }
    return false;
}

/** redirectUrl only when it points at this site; otherwise the default. */
export function safeSiteRedirect(redirectUrl: unknown, fallback: string): string {
    if (typeof redirectUrl !== 'string' || !redirectUrl) return fallback;
    try {
        const site = new URL(fallback);
        const target = new URL(redirectUrl, site);
        if (target.protocol !== 'https:' && target.protocol !== 'http:') return fallback;
        return target.origin === site.origin ? target.toString() : fallback;
    } catch {
        return fallback;
    }
}

export async function findOrderByRef(ref: string): Promise<any | null> {
    if (UUID_RE.test(ref)) {
        const byId = await supabase.from('orders').select(ORDER_PAYMENT_SELECT).eq('id', ref).maybeSingle();
        if (!byId.error && byId.data) return byId.data;
    }
    if (!/^[A-Za-z0-9-]{1,64}$/.test(ref)) return null;
    const byRef = await supabase.from('orders').select(ORDER_PAYMENT_SELECT).eq('order_number', ref).maybeSingle();
    return byRef.error ? null : byRef.data;
}

export interface RemovedItem {
    name: string;
    variant?: string;
    /** Same values under the names the current RNH pages read. */
    product_name: string;
    variant_name?: string;
    quantity: number;
}

export type PreparedPayment =
    | {
          ok: true;
          order: any;
          orderRef: string;
          amount: number;
          removedItems: RemovedItem[];
          metadata: Record<string, any>;
      }
    | { ok: false; response: NextResponse };

function fail(status: number, message: string, extra?: Record<string, unknown>): PreparedPayment {
    return { ok: false, response: NextResponse.json({ success: false, message, ...(extra || {}) }, { status }) };
}

function removed(i: any): RemovedItem {
    return {
        name: i.product_name,
        variant: i.variant_name ?? undefined,
        product_name: i.product_name,
        variant_name: i.variant_name ?? undefined,
        quantity: Number(i.quantity) || 0,
    };
}

/**
 * Everything payment init needs before talking to a gateway:
 * find the order, check the caller may pay it, check stock, remove
 * out-of-stock lines, re-price surviving lines from the catalogue (with the
 * coupon), and save those server prices on the order with
 * metadata.payment_server_amount = the amount that will be charged.
 */
export async function preparePaymentForOrder(
    req: Request,
    body: Record<string, any>,
    logTag: string,
): Promise<PreparedPayment> {
    const orderId = body?.orderId;
    if (!orderId || typeof orderId !== 'string' || orderId.length > 64) {
        return fail(400, 'Missing or invalid orderId');
    }

    const order = await findOrderByRef(orderId.trim());
    if (!order) {
        console.error(`[${logTag}] Order not found:`, orderId);
        return fail(404, 'Order not found');
    }

    if (!(await callerMayPayOrder(req, order, body))) {
        console.warn(`[${logTag}] Payment init refused (no ownership proof) for`, order.order_number);
        return fail(403, 'We could not confirm this order belongs to you.');
    }

    if (order.payment_status === 'paid') return fail(400, 'This order is already paid.');
    if (order.status === 'cancelled' || order.status === 'refunded' || order.payment_status === 'refunded') {
        return fail(400, 'This order is closed and can no longer be paid.');
    }

    const { data: orderItems, error: orderItemsError } = await supabase
        .from('order_items')
        .select('id, product_id, variant_id, product_name, variant_name, quantity, total_price, unit_price, metadata')
        .eq('order_id', order.id);
    if (orderItemsError || !orderItems) return fail(500, 'Could not validate stock');
    if (orderItems.length === 0) return fail(409, 'This order has no items to pay for.');

    if (orderItems.some((i: any) => !Number.isInteger(Number(i.quantity)) || Number(i.quantity) <= 0)) {
        console.error(`[${logTag}] Non-positive quantity on order`, order.order_number);
        return fail(400, 'This order has an invalid item quantity. Please contact support.');
    }

    // --- Stock -----------------------------------------------------------------
    const productIds = Array.from(new Set(orderItems.filter((i: any) => i.product_id).map((i: any) => i.product_id as string)));
    const productStock: Record<string, { quantity: number; bypass: boolean }> = {};
    const variantsByProduct: Record<string, any[]> = {};
    if (productIds.length > 0) {
        const { data: products } = await supabase
            .from('products')
            .select('id, quantity, track_quantity, continue_selling, metadata')
            .in('id', productIds);
        for (const p of (products ?? []) as any[]) {
            productStock[p.id] = {
                quantity: Number(p.quantity ?? 0),
                // Preorder items are bought before stock arrives: never drop them for stock 0.
                bypass: Boolean(p.continue_selling) || p.track_quantity === false || isPreorderProduct(p.metadata),
            };
        }
        const { data: variants } = await supabase
            .from('product_variants')
            .select('id, product_id, name, quantity')
            .in('product_id', productIds);
        for (const v of (variants ?? []) as any[]) {
            (variantsByProduct[v.product_id] ||= []).push(v);
        }
    }

    const outOfStock: any[] = [];
    const surviving: any[] = [];
    for (const item of orderItems as any[]) {
        const needed = Number(item.quantity);
        const p = item.product_id ? productStock[item.product_id] : undefined;
        let oos: boolean;
        if (!p) {
            oos = true; // product deleted
        } else if (p.bypass) {
            oos = false; // preorder / oversell allowed
        } else {
            const pvs = variantsByProduct[item.product_id] || [];
            const variant = item.variant_id
                ? pvs.find((v) => v.id === item.variant_id)
                : item.variant_name
                  ? pvs.find((v) => v.name === item.variant_name)
                  : null;
            oos = variant ? Number(variant.quantity ?? 0) < needed : p.quantity < needed;
        }
        (oos ? outOfStock : surviving).push(item);
    }

    if (surviving.length === 0) {
        return fail(409, 'All items in this order are out of stock and cannot be paid for.', {
            all_out_of_stock: true,
            outOfStock: outOfStock.map(removed),
        });
    }

    // --- Server price ------------------------------------------------------------
    let charge: OrderCharge;
    try {
        charge = await computeOrderCharge(order, surviving as ChargeItem[]);
    } catch (e: any) {
        console.error(`[${logTag}] Pricing failed:`, e?.message || e);
        return fail(500, 'Could not verify item prices. Please try again.');
    }
    if (charge.missing.length > 0) {
        // Inactive / deleted product or option: treat like out of stock.
        const missingSet = new Set(charge.missing);
        for (const item of surviving.filter((i) => missingSet.has(i.id))) outOfStock.push(item);
        const stillThere = surviving.filter((i) => !missingSet.has(i.id));
        if (stillThere.length === 0) {
            return fail(409, 'The items in this order are no longer available.', {
                all_out_of_stock: true,
                outOfStock: outOfStock.map(removed),
            });
        }
        surviving.length = 0;
        surviving.push(...stillThere);
        try {
            charge = await computeOrderCharge(order, surviving as ChargeItem[]);
        } catch (e: any) {
            console.error(`[${logTag}] Pricing failed:`, e?.message || e);
            return fail(500, 'Could not verify item prices. Please try again.');
        }
        if (charge.missing.length > 0) return fail(500, 'Could not verify item prices. Please try again.');
    }
    if (!charge.total || charge.total <= 0) return fail(400, 'Invalid order amount');

    const metaIn: Record<string, any> = order.metadata || {};
    const nowIso = new Date().toISOString();
    const metadata: Record<string, any> = { ...metaIn, payment_server_amount: charge.total };
    if (Math.abs(Number(order.total) - charge.total) > 0.01) {
        console.warn(`[${logTag}] Re-priced order`, order.order_number, '| stored:', order.total, '| server:', charge.total);
        metadata.server_repriced_at = nowIso;
        metadata.client_total_attempt = metaIn.client_total_attempt ?? Number(order.total);
    }
    if (outOfStock.length > 0) {
        metadata.auto_removed_items = [
            ...((Array.isArray(metaIn.auto_removed_items) ? metaIn.auto_removed_items : []) as any[]),
            ...outOfStock.map((i) => ({
                product_name: i.product_name,
                variant_name: i.variant_name ?? null,
                quantity: Number(i.quantity) || 0,
                removed_at: nowIso,
                reason: 'out_of_stock_at_payment',
            })),
        ];
    }
    if (metaIn.coupon_code && !charge.couponCode) {
        metadata.coupon_dropped = { code: metaIn.coupon_code, reason: charge.couponMessage, at: nowIso };
        delete metadata.coupon_code;
    }

    const lineById = new Map(charge.lines.map((l) => [l.id, l]));
    try {
        await withTransaction(async () => {
            if (outOfStock.length > 0) {
                const { error } = await supabase
                    .from('order_items')
                    .delete()
                    .in('id', outOfStock.map((i) => i.id));
                if (error) throw new Error(`remove OOS: ${error.message}`);
            }
            for (const item of surviving) {
                const line = lineById.get(item.id)!;
                const sameUnit = Math.abs(Number(item.unit_price) - line.unit) <= 0.001;
                const sameTotal = Math.abs(Number(item.total_price) - line.total) <= 0.001;
                const sameVariant = (item.variant_id || null) === (line.variantId || null);
                if (sameUnit && sameTotal && sameVariant) continue;
                const { error } = await supabase
                    .from('order_items')
                    .update({ unit_price: line.unit, total_price: line.total, variant_id: line.variantId })
                    .eq('id', item.id);
                if (error) throw new Error(`reprice item: ${error.message}`);
            }
            const { error: orderErr } = await supabase
                .from('orders')
                .update({
                    subtotal: charge.subtotal,
                    discount_total: charge.discount,
                    shipping_total: 0,
                    tax_total: 0,
                    total: charge.total,
                    metadata,
                })
                .eq('id', order.id)
                .neq('payment_status', 'paid');
            if (orderErr) throw new Error(`update order: ${orderErr.message}`);
        });
    } catch (e: any) {
        console.error(`[${logTag}] Failed to save server prices:`, e?.message || e);
        return fail(500, 'Could not recalculate order. Please try again.');
    }

    order.total = charge.total;
    order.subtotal = charge.subtotal;
    order.discount_total = charge.discount;
    order.metadata = metadata;

    return {
        ok: true,
        order,
        orderRef: order.order_number || orderId,
        amount: charge.total,
        removedItems: outOfStock.map(removed),
        metadata,
    };
}
