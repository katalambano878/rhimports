import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IP_LIMIT = { maxRequests: 5, windowSeconds: 600 };
const EMAIL_LIMIT = { maxRequests: 3, windowSeconds: 3600 };
const SOURCE_RE = /^[a-z0-9_-]{1,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function error(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

/**
 * Subscribe an email to store news. Body: { email, source? } → { ok: true }.
 * Re-subscribes an address that had unsubscribed. Same answer whether or not
 * the address was already on the list.
 */
export async function POST(request: Request) {
    const ip = getClientIdentifier(request);
    if (!checkRateLimit(`newsletter:ip:${ip}`, IP_LIMIT).success) {
        return error('Too many attempts. Please try again in a few minutes.', 429);
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return error('Invalid request.', 400);
    }

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawSource = typeof body?.source === 'string' ? body.source.trim().toLowerCase() : '';
    const source = SOURCE_RE.test(rawSource) ? rawSource : 'website';

    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
        return error('Please enter a valid email address.', 400);
    }
    if (!checkRateLimit(`newsletter:email:${email}`, EMAIL_LIMIT).success) {
        return error('Too many attempts for this email. Please try again later.', 429);
    }

    const supabase = createServerSupabase('service');
    try {
        const { data: existing, error: findError } = await supabase
            .from('newsletter_subscribers')
            .select('id, unsubscribed_at')
            .eq('email', email)
            .maybeSingle();
        if (findError) throw new Error(findError.message);

        if (existing) {
            if (existing.unsubscribed_at) {
                const { error: updateError } = await supabase
                    .from('newsletter_subscribers')
                    .update({ unsubscribed_at: null, source })
                    .eq('id', existing.id);
                if (updateError) throw new Error(updateError.message);
            }
            return NextResponse.json({ ok: true });
        }

        const { error: insertError } = await supabase.from('newsletter_subscribers').insert({ email, source });
        // 23505: the same address (any case) was subscribed at the same moment.
        if (insertError && (insertError as any).code !== '23505') throw new Error(insertError.message);

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[newsletter] subscribe failed:', err?.message || err);
        return error('We could not save your email right now. Please try again.', 500);
    }
}
