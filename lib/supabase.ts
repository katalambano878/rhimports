import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ---- session cookie for the server-side admin gate ---------------------------
//
// supabase-js keeps the session in localStorage, which the server never sees.
// middleware.ts gates /admin/* on the `sb-access-token` cookie, so this module
// mirrors the current access token into that cookie on every auth change
// (sign-in, token refresh, page load with a stored session) and clears it on
// sign-out. Every page that imports `supabase` keeps it fresh; no page needs
// to call anything for this.

export const ADMIN_SESSION_COOKIE = 'sb-access-token';
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

/** Write (or with null, clear) the session cookie the middleware reads. */
export function syncAdminSessionCookie(session: Pick<Session, 'access_token'> | null | undefined): void {
    if (typeof document === 'undefined') return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = session?.access_token
        ? `${ADMIN_SESSION_COOKIE}=${session.access_token}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`
        : `${ADMIN_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

/** A same-site /admin path from `?redirect=`, never the login page itself. */
function adminRedirectTarget(raw: string | null): string {
    if (raw) {
        try {
            const url = new URL(raw, window.location.origin);
            if (
                url.origin === window.location.origin &&
                (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) &&
                url.pathname !== '/admin/login'
            ) {
                return url.pathname + url.search + url.hash;
            }
        } catch {
            // fall through to the dashboard
        }
    }
    return '/admin';
}

/**
 * On /admin/login, a visitor who is already signed in (session in
 * localStorage, cookie missing or expired) goes straight on to the page the
 * middleware sent them from, now that the cookie is set. Skipped when the
 * middleware reported a problem (`?error=unauthorized` / `session_expired`),
 * so a rejected session never loops.
 */
export function resumeAdminSession(session: Session | null): void {
    if (typeof window === 'undefined' || !session) return;
    if (window.location.pathname !== '/admin/login') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) return;
    syncAdminSessionCookie(session);
    window.location.replace(adminRedirectTarget(params.get('redirect')));
}

if (typeof window !== 'undefined') {
    supabase.auth.onAuthStateChange((event, session) => {
        syncAdminSessionCookie(session);
        if (event === 'INITIAL_SESSION') resumeAdminSession(session);
    });
}
