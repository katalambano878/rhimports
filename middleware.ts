import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, errors as joseErrors } from 'jose';
import { authJwtSecret } from '@/lib/db/mode';

// Server-side gate for the admin dashboard. The middleware runs on the edge
// and cannot reach the database: it checks the session token's signature
// itself, then asks the app (same container, over loopback) for the live
// role, so a demoted, banned or signed-out-everywhere staff member loses the
// dashboard at once. The browser mirrors its session into the
// `sb-access-token` cookie (lib/supabase.ts).

const SESSION_COOKIE = 'sb-access-token';

/** `next start -H 0.0.0.0 -p 3000` in production; override with INTERNAL_APP_ORIGIN. */
function internalOrigin(request: NextRequest): string {
    if (process.env.INTERNAL_APP_ORIGIN) return process.env.INTERNAL_APP_ORIGIN.replace(/\/+$/, '');
    if (process.env.NODE_ENV !== 'production') return request.nextUrl.origin;
    return 'http://127.0.0.1:3000';
}

const ROLE_CACHE_TTL_MS = 30 * 1000;
const roleCache = new Map<string, { userId: string; role: string; fetchedAt: number }>();

type TokenCheck =
    | { status: 'ok'; userId: string; role: string }
    /** No usable session: missing, expired, bad signature, revoked or no profile. */
    | { status: 'expired' }
    | { status: 'invalid' }
    /** Signature is valid but the role lookup could not run (app unreachable). */
    | { status: 'unverified'; userId: string };

/** The same signing secret lib/db/auth.ts uses (AUTH_JWT_SECRET, JWT_SECRET or SUPABASE_JWT_SECRET). */
function jwtSecret(): string | null {
    try {
        return authJwtSecret();
    } catch {
        return null;
    }
}

async function checkToken(request: NextRequest, token: string): Promise<TokenCheck> {
    const secret = jwtSecret();
    if (!secret) return { status: 'invalid' };
    let userId: string;
    try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
        if (payload.typ === 'refresh' || payload.role !== 'authenticated' || typeof payload.sub !== 'string') {
            return { status: 'invalid' };
        }
        if (typeof payload.exp !== 'number') return { status: 'invalid' };
        userId = payload.sub;
    } catch (e) {
        return { status: e instanceof joseErrors.JWTExpired ? 'expired' : 'invalid' };
    }

    const now = Date.now();
    const cached = roleCache.get(token);
    if (cached && now - cached.fetchedAt < ROLE_CACHE_TTL_MS) {
        return { status: 'ok', userId: cached.userId, role: cached.role };
    }
    try {
        const res = await fetch(`${internalOrigin(request)}/api/auth/session-role`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        });
        if (res.status === 401) return { status: 'invalid' };
        if (!res.ok) return { status: 'unverified', userId };
        const body = (await res.json()) as { userId?: string; role?: string };
        if (!body.userId || !body.role) return { status: 'invalid' };
        if (roleCache.size > 500) roleCache.clear();
        roleCache.set(token, { userId: body.userId, role: body.role, fetchedAt: now });
        return { status: 'ok', userId: body.userId, role: body.role };
    } catch {
        return { status: 'unverified', userId };
    }
}

function toLogin(request: NextRequest, error?: 'session_expired' | 'unauthorized'): NextResponse {
    const { pathname, search } = request.nextUrl;
    const loginUrl = new URL('/admin/login', request.url);
    if (error !== 'unauthorized') loginUrl.searchParams.set('redirect', pathname + search);
    if (error) loginUrl.searchParams.set('error', error);
    const res = NextResponse.redirect(loginUrl);
    res.headers.set('Cache-Control', 'no-store');
    return res;
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const response = NextResponse.next();

    // Add extra security headers for admin routes
    if (pathname.startsWith('/admin')) {
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }

    // The login page is open; everything else under /admin needs staff.
    if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
        return response;
    }

    const token = request.cookies.get(SESSION_COOKIE)?.value;
    // No cookie, or an access token that merely expired: send them to the
    // login page without an error, where a session still held in the browser
    // is refreshed, mirrored into the cookie and sent straight back here.
    if (!token) return toLogin(request);

    const check = await checkToken(request, token);
    if (check.status === 'expired') return toLogin(request);
    if (check.status === 'invalid') return toLogin(request, 'session_expired');
    if (check.status === 'unverified') {
        // The role lookup could not run (app restarting, loopback blocked).
        // Never lock staff out over that: the signature is valid, the admin
        // layout still checks the role, and row-level security still guards
        // every read and write.
        console.error('[middleware] role lookup unavailable; letting a signed session through');
        response.headers.set('x-user-id', check.userId);
        return response;
    }
    if (check.role !== 'admin' && check.role !== 'staff') {
        return toLogin(request, 'unauthorized');
    }

    // Auth passed — set user info in headers for downstream use
    response.headers.set('x-user-id', check.userId);
    response.headers.set('x-user-role', check.role);
    return response;
}

export const config = {
    matcher: ['/admin/:path*'],
};
