import { createClient } from '@supabase/supabase-js';
import { isPlainPostgres } from '@/lib/db/mode';
import { createClientAs } from '@/lib/db/supabase-compat';

/**
 * Server-side database client for API routes, server components and actions.
 *
 * - 'service' bypasses RLS (the old SUPABASE_SERVICE_ROLE_KEY client).
 * - 'anon' applies the same RLS policies a storefront visitor gets.
 *
 * On plain Postgres both run in-process against DATABASE_URL, so server code
 * never makes an HTTP round trip to the public domain (which may still point
 * at the old host during a DNS cutover).
 */
export function createServerSupabase(role: 'service' | 'anon'): any {
  if (isPlainPostgres()) {
    return createClientAs(role === 'service' ? null : { kind: 'anon', claims: { role: 'anon' } });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const key = role === 'service' ? process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey : anonKey;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
