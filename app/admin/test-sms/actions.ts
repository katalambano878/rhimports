'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { sendSMS } from '@/lib/notifications';
import { checkRateLimit } from '@/lib/rate-limit';

/** Test sends per staff member: enough to debug, not enough to spam. */
const TEST_SMS_LIMIT = { maxRequests: 5, windowSeconds: 10 * 60 };

function maskPhone(phone: string) {
    return phone.length < 6 ? '***' : `${phone.slice(0, 4)}****${phone.slice(-2)}`;
}

// Verify the caller is an authenticated admin/staff user before performing any
// privileged action. Server actions are directly invocable, so this guard is
// required — without it anyone could trigger SMS sends using server creds.
async function assertAdmin(accessToken?: string): Promise<{ ok: boolean; userId?: string; error?: string }> {
    if (!accessToken) return { ok: false, error: 'Unauthorized' };

    const admin = createServerSupabase('service');

    const { data: { user }, error } = await admin.auth.getUser(accessToken);
    if (error || !user) return { ok: false, error: 'Unauthorized' };

    const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
        return { ok: false, error: 'Forbidden' };
    }
    return { ok: true, userId: user.id };
}

export async function testSmsAction(phone: string, message: string, accessToken?: string) {
    try {
        const auth = await assertAdmin(accessToken);
        if (!auth.ok || !auth.userId) {
            return { success: false, error: auth.error || 'Unauthorized' };
        }

        // Validate input before spending a rate-limit slot.
        if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 9 || phone.length > 20) {
            return { success: false, error: 'Enter a valid phone number' };
        }
        if (!message || typeof message !== 'string' || !message.trim() || message.length > 480) {
            return { success: false, error: 'Message is empty or too long (480 characters max)' };
        }

        const rl = checkRateLimit(`test-sms:${auth.userId}`, TEST_SMS_LIMIT);
        if (!rl.success) {
            return {
                success: false,
                error: `Too many test messages. Try again in ${Math.max(1, Math.ceil(rl.resetIn / 60))} minute(s).`
            };
        }

        console.log('[Test SMS] to', maskPhone(phone), '| by user:', auth.userId);
        // Same send path as receipts and campaigns (Taysend, then Moolre fallback).
        const result: any = await sendSMS({ to: phone, message: message.trim() });
        const ok = !!result && Number(result.status ?? 1) === 1;
        return {
            success: ok,
            result: result ?? { error: 'No SMS provider accepted the message. Check the SMS settings and the server log.' },
            remainingThisWindow: rl.remaining,
        };
    } catch (error: any) {
        console.error('[Test SMS] Error:', error?.message);
        return {
            success: false,
            error: 'SMS sending failed. See the server log for details.'
        };
    }
}
