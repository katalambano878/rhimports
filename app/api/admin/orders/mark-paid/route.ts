import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { verifyAuth } from '@/lib/auth';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { runPaidSideEffects } from '@/app/api/payment/_lib/after-paid';

export const dynamic = 'force-dynamic';

/**
 * Staff "Mark as paid" (admin / staff).
 * Body: { orderNumber, reference? }
 * 200 → { success: true, order }   (order.already_paid = true when it was paid before)
 *
 * Calls mark_order_paid (idempotent: stock and coupon count once), keeps a
 * gateway reference already stored on the order, then runs the paid side
 * effects (customer stats, confirmation email/SMS) once.
 */
export async function POST(request: Request) {
    const rl = checkRateLimit(`admin-mark-paid:${getClientIdentifier(request)}`, RATE_LIMITS.payment);
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const auth = await verifyAuth(request, { requireRole: ['admin', 'staff'] });
    if (!auth.authenticated || !auth.user?.id) {
        return NextResponse.json({ error: auth.user ? 'Admin access required' : 'Unauthorized' }, { status: auth.user ? 403 : 401 });
    }

    try {
        const body = await request.json().catch(() => null);
        const { orderNumber, reference } = body ?? {};
        if (!orderNumber || typeof orderNumber !== 'string' || !/^ORD-\d+-\d+$/.test(orderNumber)) {
            return NextResponse.json({ error: 'Invalid order number' }, { status: 400 });
        }

        const supabase = createServerSupabase('service');
        const { data: existing, error: lookupError } = await supabase
            .from('orders')
            .select('id, order_number, email, total, status, payment_status, metadata')
            .eq('order_number', orderNumber)
            .maybeSingle();
        if (lookupError) {
            console.error('[admin/mark-paid] lookup error:', lookupError.message);
            return NextResponse.json({ error: 'Failed to load the order' }, { status: 500 });
        }
        if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        if (existing.payment_status === 'paid') {
            return NextResponse.json({ success: true, order: { ...existing, already_paid: true } });
        }
        if (existing.status === 'cancelled' || existing.status === 'refunded' || existing.payment_status === 'refunded') {
            return NextResponse.json({ error: 'This order is cancelled or refunded.' }, { status: 409 });
        }

        const storedRef =
            typeof existing.metadata?.moolre_reference === 'string' && existing.metadata.moolre_reference.trim()
                ? existing.metadata.moolre_reference.trim()
                : null;
        const suppliedRef = typeof reference === 'string' && reference.trim() ? reference.trim().slice(0, 120) : null;
        const moolreRef = storedRef || suppliedRef || `admin-${auth.user.id}-${Date.now()}`;

        const { data: order, error } = await supabase.rpc('mark_order_paid', {
            order_ref: orderNumber,
            moolre_ref: moolreRef,
        });
        if (error) {
            console.error('[admin/mark-paid] mark_order_paid failed:', error.message);
            return NextResponse.json({ error: 'Failed to mark order as paid' }, { status: 500 });
        }
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

        if (!order.already_paid) {
            const { error: metaErr } = await supabase
                .from('orders')
                .update({
                    metadata: {
                        ...(order.metadata || {}),
                        marked_paid_by: auth.user.id,
                        marked_paid_at: new Date().toISOString(),
                    },
                })
                .eq('id', order.id);
            if (metaErr) console.error('[admin/mark-paid] metadata update failed:', metaErr.message);
        }

        await runPaidSideEffects(order, 'admin/mark-paid');

        return NextResponse.json({ success: true, order });
    } catch (err: any) {
        console.error('[admin/mark-paid] Error:', err?.message);
        return NextResponse.json({ error: 'Failed to mark order as paid' }, { status: 500 });
    }
}
