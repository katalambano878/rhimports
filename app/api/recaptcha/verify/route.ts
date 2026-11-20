import { NextResponse } from 'next/server';
import { verifyRecaptcha } from '@/lib/recaptcha';

export async function POST(request: Request) {
    try {
        const { token, action } = await request.json().catch(() => ({} as any));

        if (!token) {
            return NextResponse.json(
                { success: false, error: 'Missing reCAPTCHA token' },
                { status: 400 }
            );
        }

        if (typeof token !== 'string' || token.length > 4000) {
            return NextResponse.json({ success: false, error: 'Invalid reCAPTCHA token' }, { status: 400 });
        }
        const result = await verifyRecaptcha(token, typeof action === 'string' ? action : undefined);

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error || 'Verification failed' },
                { status: 403 }
            );
        }

        return NextResponse.json({ success: true, score: result.score });
    } catch (error: any) {
        console.error('[reCAPTCHA API] Error:', error.message);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
