/**
 * Side effects after mark_order_paid. mark_order_paid is idempotent: when the
 * order was already paid it returns the order JSON with `already_paid: true`;
 * then the confirmation email/SMS and customer stats have already run, so they
 * are skipped here. Callers must only run this with the JSON that
 * mark_order_paid returned.
 */
import { createServerSupabase } from '@/lib/supabase-server';
import { sendOrderConfirmation, isPlaceholderEmail } from '@/lib/notifications';

const supabase = createServerSupabase('service');

export function isPosSale(metadata: unknown): boolean {
    return !!metadata && typeof metadata === 'object' && (metadata as Record<string, unknown>).pos_sale === true;
}

/** Blank a placeholder address so the send helpers skip email for this order. */
export function withRealEmailOnly<T extends { email?: string | null }>(order: T): T {
    return isPlaceholderEmail(order.email) ? { ...order, email: '' } : order;
}

/**
 * Returns true when side effects ran (false when already paid / no order).
 * `opts.skipStats`: the caller already counted the sale (the till does it
 * inside its transaction).
 */
export async function runPaidSideEffects(
    orderJson: any,
    logTag: string,
    opts: { skipStats?: boolean } = {},
): Promise<boolean> {
    if (!orderJson) return false;
    if (orderJson.already_paid === true) {
        console.log(`[${logTag}] Order already paid, side effects skipped:`, orderJson.order_number);
        return false;
    }

    if (!opts.skipStats) {
        // Till sales are counted against metadata.customer_email (may be a phone@pos.local key).
        const statsEmail = isPosSale(orderJson.metadata)
            ? (typeof orderJson.metadata?.customer_email === 'string' && orderJson.metadata.customer_email.trim()) || null
            : orderJson.email;
        if (statsEmail) {
            try {
                const { error } = await supabase.rpc('update_customer_stats', {
                    p_customer_email: statsEmail,
                    p_order_total: Number(orderJson.total) || 0,
                });
                if (error) console.error(`[${logTag}] Customer stats failed:`, error.message);
            } catch (e: any) {
                console.error(`[${logTag}] Customer stats failed:`, e?.message || e);
            }
        }
    }

    // Email + SMS confirmation. Till sales only get it when a real email was given
    // (same as the till did before).
    if (!isPosSale(orderJson.metadata) || !isPlaceholderEmail(orderJson.email)) {
        try {
            await sendOrderConfirmation(withRealEmailOnly(orderJson));
        } catch (e: any) {
            console.error(`[${logTag}] Notification failed:`, e?.message || e);
        }
    }
    return true;
}
