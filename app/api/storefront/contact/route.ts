import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { sendContactMessage } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IP_LIMIT = { maxRequests: 5, windowSeconds: 900 };
const EMAIL_LIMIT = { maxRequests: 3, windowSeconds: 3600 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function error(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

function clean(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Contact form.
 * Body: { name, email, phone?, subject, message }
 * 200 → { ok: true, reference }
 * Saves the message to contact_submissions (status 'new'), alerts the store,
 * and sends the visitor a fixed acknowledgement that never repeats what they
 * typed (the address is not verified).
 */
export async function POST(request: Request) {
    const ip = getClientIdentifier(request);
    if (!checkRateLimit(`contact:ip:${ip}`, IP_LIMIT).success) {
        return error('Too many messages. Please wait a few minutes and try again.', 429);
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return error('Invalid request.', 400);
    }

    const name = clean(body?.name, 120);
    const email = clean(body?.email, 254).toLowerCase();
    const phone = clean(body?.phone, 30);
    const subject = clean(body?.subject, 150);
    const message = clean(body?.message, 5000);

    if (!name) return error('Please enter your name.', 400);
    if (!email || !EMAIL_RE.test(email)) return error('Please enter a valid email address.', 400);
    if (phone && phone.replace(/\D/g, '').length < 9) return error('Please enter a valid phone number or leave it empty.', 400);
    if (!subject) return error('Please choose a subject.', 400);
    if (message.length < 10) return error('Please write a message of at least 10 characters.', 400);

    if (!checkRateLimit(`contact:email:${email}`, EMAIL_LIMIT).success) {
        return error('You have sent several messages already. We will reply soon.', 429);
    }

    const supabase = createServerSupabase('service');
    const { data: saved, error: insertError } = await supabase
        .from('contact_submissions')
        .insert({ name, email, phone: phone || null, subject, message, status: 'new' })
        .select('id')
        .single();
    if (insertError) {
        console.error('[contact] insert failed:', insertError.message);
        return error('We could not send your message right now. Please try again, or WhatsApp us.', 500);
    }

    try {
        await sendContactMessage({ name, email, phone, subject, message });
    } catch (err: any) {
        console.error('[contact] mail failed:', err?.message || err);
    }

    return NextResponse.json({ ok: true, reference: saved?.id ?? null });
}
