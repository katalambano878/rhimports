import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { sendOrderConfirmation } from '@/lib/notifications';

const supabase = createServerSupabase('service');

/**
 * Payment verification endpoint.
 * Called from the order-success page after the user completes payment on Moolre.
 * 
 * Moolre redirects the user to our success page ONLY after payment succeeds.
 * The redirect URL contains payment_success=true which we set in the payment request.
 * Since only Moolre controls this redirect, the redirect itself is proof of payment.
 * 
 * We also try to verify with Moolre's API as an extra check.
 */
export async function POST(req: Request) {
    try {
        const { orderNumber, fromRedirect } = await req.json();

        if (!orderNumber) {
            return NextResponse.json({ success: false, message: 'Missing orderNumber' }, { status: 400 });
        }

        console.log('[Verify] Checking payment for:', orderNumber, '| fromRedirect:', fromRedirect);

        // 1. Check current order status
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('id, order_number, payment_status, status, total, email, phone, shipping_address, metadata')
            .eq('order_number', orderNumber)
            .single();

        if (fetchError || !order) {
            console.error('[Verify] Order not found:', orderNumber);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        // Already paid - no action needed
        if (order.payment_status === 'paid') {
            console.log('[Verify] Order already paid:', orderNumber);
            return NextResponse.json({ 
                success: true, 
                status: order.status,
                payment_status: order.payment_status,
                message: 'Order already paid' 
            });
        }

        // 2. Verify payment method is moolre
        if (order.metadata?.payment_method !== 'moolre' && order.metadata?.payment_method !== undefined) {
            // Not a moolre payment - don't auto-verify
        }

        // 3. Try to verify with Moolre's API first
        let moolreApiVerified = false;
        const externalRefToCheck = order.metadata?.moolre_externalref || orderNumber;
        
        if (process.env.MOOLRE_API_USER && process.env.MOOLRE_API_PUBKEY) {
            try {
                // Try the embed/status endpoint
                const checkResponse = await fetch('https://api.moolre.com/embed/status', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-USER': process.env.MOOLRE_API_USER,
                        'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY
                    },
                    body: JSON.stringify({ externalref: externalRefToCheck })
                });

                const checkResult = await checkResponse.json();
                console.log('[Verify] Moolre API response:', JSON.stringify(checkResult));
                
                const statusStr = String(checkResult.data?.status || '').toLowerCase();
                moolreApiVerified = 
                    statusStr === 'success' || 
                    statusStr === 'successful' || 
                    statusStr === 'completed' || 
                    statusStr === 'paid' ||
                    (checkResult.status === 1 && checkResult.data);
                    
            } catch (moolreError: any) {
                console.warn('[Verify] Moolre API check failed:', moolreError.message);
            }
        }

        // 4. Determine if we should mark as paid.
        // Do NOT trust client query params alone; payment must be confirmed by gateway/callback.
        const shouldMarkPaid = moolreApiVerified;

        if (!shouldMarkPaid) {
            console.log('[Verify] Cannot verify payment for:', orderNumber);
            return NextResponse.json({ 
                success: false, 
                status: order.status,
                payment_status: order.payment_status,
                message: fromRedirect === true
                    ? 'Payment redirect received, awaiting gateway confirmation. Please refresh shortly.'
                    : 'Payment not yet confirmed'
            });
        }

        const verifySource = moolreApiVerified ? 'moolre-api' : 'redirect-verification';
        console.log('[Verify] Marking order paid via:', verifySource, 'for:', orderNumber);

        // 5. Mark as paid
        const { data: orderJson, error: updateError } = await supabase
            .rpc('mark_order_paid', {
                order_ref: orderNumber,
                moolre_ref: verifySource
            });

        if (updateError) {
            console.error('[Verify] RPC Error:', updateError.message);
            return NextResponse.json({ success: false, message: 'Failed to update order' }, { status: 500 });
        }

        console.log('[Verify] Order marked as paid:', orderNumber);

        // 6. Update customer stats
        if (orderJson?.email) {
            try {
                await supabase.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total
                });
            } catch (statsError: any) {
                console.error('[Verify] Customer stats failed:', statsError.message);
            }
        }

        // 7. Send notifications (SMS + Email)
        if (orderJson) {
            try {
                await sendOrderConfirmation(orderJson);
                console.log('[Verify] Notifications sent for:', orderNumber);
            } catch (notifyError: any) {
                console.error('[Verify] Notification failed:', notifyError.message);
            }
        }

        return NextResponse.json({ 
            success: true, 
            status: 'processing',
            payment_status: 'paid',
            message: 'Payment verified and order updated' 
        });

    } catch (error: any) {
        console.error('[Verify] Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}
