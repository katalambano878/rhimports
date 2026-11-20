import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { verifyAuth } from '@/lib/auth';
import {
    sendOrderStatusUpdate,
    sendWelcomeMessage,
    sendPaymentLink,
    sendEmail,
    sendSMS,
    emailLayout,
    escapeHtml,
    isPlaceholderEmail,
} from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_CONTACT_COLUMNS =
    'id, order_number, email, phone, shipping_address, shipping_method, shipping_total, metadata, total, created_at, status, payment_status';
const WELCOME_LIMIT = { maxRequests: 3, windowSeconds: 3600 };
const WELCOME_WINDOW_MS = 30 * 60 * 1000;

/**
 * POST /api/notifications  { type, payload }
 *
 * Staff only (admin/staff bearer token):
 *   order_updated  { order: { id | order_number }, status? }
 *   order_status   { orderNumber, status }
 *   payment_link   { id | order_number }
 *   campaign       { recipients[], subject, message, channels{email,sms}, audience? }
 *                  → { success, sent{email,sms}, failed{email,sms}, skippedPlaceholder, skippedNotInAudience, message }
 * Contact details always come from the database, never the request.
 *
 * Narrow public type:
 *   welcome        { firstName? } — mails ONLY the caller's own address with
 *                  fixed text: a signed-in caller (bearer), or a sign-up made in
 *                  the last 30 minutes ({ email } must match that new profile),
 *                  once per account.
 *
 * Retired (410): order_created (confirmations are sent by the server after
 * payment), contact (use POST /api/storefront/contact).
 */

function authFailure(a: { user?: any; error?: string }) {
    return NextResponse.json({ error: a.user ? 'Admin access required' : 'Unauthorized' }, { status: a.user ? 403 : 401 });
}

function withRealEmailOnly<T extends { email?: string | null }>(order: T): T {
    return isPlaceholderEmail(order.email) ? { ...order, email: '' } : order;
}

async function loadOrderForNotification(ref: unknown) {
    const value = typeof ref === 'string' ? ref.trim() : '';
    if (!value) return null;
    const supabase = createServerSupabase('service');
    let q = supabase.from('orders').select(ORDER_CONTACT_COLUMNS);
    if (UUID_RE.test(value)) q = q.eq('id', value);
    else if (/^[A-Za-z0-9-]{1,64}$/.test(value)) q = q.eq('order_number', value);
    else return null;
    const { data, error } = await q.maybeSingle();
    if (error || !data) return null;
    return data as any;
}

/** sendSMS returns null on failure and a provider result with status 1 on success. */
function smsSucceeded(result: any): boolean {
    return !!result && Number(result.status) === 1;
}

function normPhone(p: string): string {
    return p.replace(/[\s\-().]+/g, '').replace(/^00/, '+');
}

function phoneTail(p: unknown): string {
    const d = String(p || '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : '';
}

/** A first name for the greeting: letters, spaces, hyphens, apostrophes only. */
function cleanFirstName(raw: unknown): string {
    const s = typeof raw === 'string' ? raw.trim().split(/\s+/)[0] || '' : '';
    return /^[\p{L}][\p{L}'\-]{0,39}$/u.test(s) ? s : 'there';
}

export async function POST(request: Request) {
    try {
        const clientId = getClientIdentifier(request);
        const rateLimitResult = checkRateLimit(`notification:${clientId}`, RATE_LIMITS.notification);
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': rateLimitResult.resetIn.toString() } },
            );
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const type = typeof body?.type === 'string' ? body.type : '';
        const payload = body?.payload && typeof body.payload === 'object' ? body.payload : null;
        if (!type || !payload) {
            return NextResponse.json({ error: 'Type and payload required' }, { status: 400 });
        }

        if (type === 'order_created') {
            return NextResponse.json(
                { error: 'Order confirmations are sent automatically once the payment is confirmed.' },
                { status: 410 },
            );
        }
        if (type === 'contact') {
            return NextResponse.json({ error: 'Use /api/storefront/contact for contact messages.' }, { status: 410 });
        }

        const supabase = createServerSupabase('service');

        // ------------------------------------------------------------------
        // welcome — the caller's own address only, fixed text, once
        // ------------------------------------------------------------------
        if (type === 'welcome') {
            if (!checkRateLimit(`welcome:${clientId}`, WELCOME_LIMIT).success) {
                return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
            }

            let profile: any = null;
            if (request.headers.get('authorization')) {
                const a = await verifyAuth(request);
                if (!a.authenticated || !a.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
                const { data } = await supabase
                    .from('profiles')
                    .select('id, email, full_name, created_at, preferences')
                    .eq('id', a.user.id)
                    .maybeSingle();
                profile = data ? { ...data, email: data.email || a.user.email } : null;
            } else {
                // Just registered, no session yet (email confirmation pending).
                const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
                if (!email || email.length > 254) return NextResponse.json({ error: 'Invalid signup request' }, { status: 400 });
                const { data } = await supabase
                    .from('profiles')
                    .select('id, email, full_name, created_at, preferences')
                    .ilike('email', email.replace(/[\\%_]/g, (m: string) => `\\${m}`))
                    .limit(1);
                const row = (data || [])[0];
                if (row && Date.now() - new Date(row.created_at).getTime() <= WELCOME_WINDOW_MS) profile = row;
            }

            // Same answer whether or not the address exists, so this can't probe accounts.
            const accepted = NextResponse.json({ success: true, message: 'Welcome message queued' });
            if (!profile?.email || isPlaceholderEmail(profile.email)) return accepted;
            const prefs = profile.preferences && typeof profile.preferences === 'object' ? profile.preferences : {};
            if (prefs.welcome_sent_at) return accepted;

            const { error: markErr } = await supabase
                .from('profiles')
                .update({ preferences: { ...prefs, welcome_sent_at: new Date().toISOString() } })
                .eq('id', profile.id);
            if (markErr) {
                console.error('[Notifications] welcome mark failed:', markErr.message);
                return accepted;
            }
            const firstName = cleanFirstName(profile.full_name || payload.firstName);
            // Email only (no SMS: the phone is not verified at sign-up).
            await sendWelcomeMessage({ email: profile.email, firstName });
            return accepted;
        }

        // ------------------------------------------------------------------
        // Everything else: admin / staff only
        // ------------------------------------------------------------------
        const auth = await verifyAuth(request, { requireRole: ['admin', 'staff'] });
        if (!auth.authenticated) return authFailure(auth);

        if (type === 'order_updated') {
            const order = payload.order;
            if (!order) return NextResponse.json({ error: 'Missing order' }, { status: 400 });
            const fullOrder = await loadOrderForNotification(order.id || order.order_number);
            if (!fullOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            await sendOrderStatusUpdate(withRealEmailOnly(fullOrder), String(fullOrder.status || payload.status || ''));
            return NextResponse.json({ success: true, message: 'Status update sent' });
        }

        if (type === 'order_status') {
            const { orderNumber, status } = payload;
            if (!orderNumber || !status || typeof status !== 'string' || status.length > 40) {
                return NextResponse.json({ error: 'Missing orderNumber or status' }, { status: 400 });
            }
            const fullOrder = await loadOrderForNotification(orderNumber);
            if (!fullOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            await sendOrderStatusUpdate(withRealEmailOnly(fullOrder), status);
            return NextResponse.json({ success: true, message: 'Status update sent' });
        }

        if (type === 'payment_link') {
            const fullOrder = await loadOrderForNotification(payload.id || payload.order_number);
            if (!fullOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            if (fullOrder.payment_status === 'paid') {
                return NextResponse.json({ error: 'This order is already paid' }, { status: 400 });
            }
            await sendPaymentLink(withRealEmailOnly(fullOrder));
            return NextResponse.json({ success: true, message: 'Payment link sent' });
        }

        if (type === 'campaign') {
            const { recipients, subject, message, channels } = payload;
            const audience = typeof payload.audience === 'string' ? payload.audience : 'customers';

            if (!Array.isArray(recipients) || recipients.length === 0) {
                return NextResponse.json({ error: 'Recipients required' }, { status: 400 });
            }
            if (recipients.length > 100) {
                return NextResponse.json({ error: 'Send at most 100 recipients per request' }, { status: 400 });
            }
            if (!channels?.email && !channels?.sms) {
                return NextResponse.json({ error: 'Select at least one channel (Email or SMS)' }, { status: 400 });
            }
            if (!message || typeof message !== 'string' || !message.trim() || message.length > 5000) {
                return NextResponse.json({ error: 'Message is required' }, { status: 400 });
            }
            if (channels?.email && (!subject || typeof subject !== 'string' || !subject.trim() || subject.length > 200)) {
                return NextResponse.json({ error: 'Email subject is required when sending email' }, { status: 400 });
            }
            if (audience !== 'customers') {
                return NextResponse.json({ error: 'Unknown audience' }, { status: 400 });
            }

            // Audience "customers": only addresses/phones that belong to a customer record.
            const { data: customers, error: custErr } = await supabase
                .from('customers')
                .select('email, secondary_email, phone, secondary_phone');
            if (custErr) {
                console.error('[Campaign] customer lookup failed:', custErr.message);
                return NextResponse.json({ error: 'Could not load the audience' }, { status: 500 });
            }
            const knownEmails = new Set<string>();
            const knownTails = new Set<string>();
            for (const c of (customers || []) as any[]) {
                for (const e of [c.email, c.secondary_email]) if (typeof e === 'string' && e) knownEmails.add(e.trim().toLowerCase());
                for (const p of [c.phone, c.secondary_phone]) {
                    const t = phoneTail(p);
                    if (t) knownTails.add(t);
                }
            }

            const seenPhones = new Set<string>();
            const seenEmails = new Set<string>();
            const sent = { email: 0, sms: 0 };
            const failed = { email: 0, sms: 0 };
            let skippedPlaceholder = 0;
            let skippedNotInAudience = 0;

            const safeSubject = escapeHtml(subject || '');
            const safeMessage = escapeHtml(message);

            for (const recipient of recipients) {
                if (!recipient || typeof recipient !== 'object') continue;
                const recipientEmail = typeof recipient.email === 'string' ? recipient.email.trim() : '';
                const recipientPhone = typeof recipient.phone === 'string' ? recipient.phone.trim() : '';

                if (channels?.email && recipientEmail) {
                    const emailKey = recipientEmail.toLowerCase();
                    if (isPlaceholderEmail(emailKey)) {
                        skippedPlaceholder++;
                    } else if (!knownEmails.has(emailKey)) {
                        skippedNotInAudience++;
                    } else if (!seenEmails.has(emailKey)) {
                        seenEmails.add(emailKey);
                        try {
                            const recipientName = escapeHtml(String(recipient.name || 'Valued Customer').slice(0, 100));
                            const html = emailLayout(`
<h2 style="margin:0 0 16px;color:#111827;font-size:22px;text-align:center;">${safeSubject}</h2>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">Hi ${recipientName},</p>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">${safeMessage.replace(/\n/g, '</p><p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">')}</p>
`, safeSubject);
                            const result = await sendEmail({ to: recipientEmail, subject, html });
                            if (result) sent.email++;
                            else failed.email++;
                        } catch (err: any) {
                            console.error('[Campaign] Email failed:', err?.message);
                            failed.email++;
                        }
                    }
                }

                if (channels?.sms && recipientPhone) {
                    const tail = phoneTail(recipientPhone);
                    const phoneKey = normPhone(recipientPhone);
                    if (!tail || !knownTails.has(tail)) {
                        skippedNotInAudience++;
                    } else if (!seenPhones.has(tail)) {
                        seenPhones.add(tail);
                        try {
                            const result = await sendSMS({ to: phoneKey, message });
                            if (smsSucceeded(result)) sent.sms++;
                            else failed.sms++;
                        } catch (err: any) {
                            console.error('[Campaign] SMS failed:', err?.message);
                            failed.sms++;
                        }
                    }
                }
            }

            const failedTotal = failed.email + failed.sms;
            return NextResponse.json({
                success: true,
                sent,
                failed,
                skippedPlaceholder,
                skippedNotInAudience,
                message: `Campaign batch: ${sent.email} emails and ${sent.sms} SMS sent.${failedTotal > 0 ? ` ${failedTotal} failed.` : ''}`,
            });
        }

        return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    } catch (error: any) {
        console.error('Notification API Error:', error?.message || error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
