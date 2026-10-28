-- RNH Imports on plain Postgres: request roles for RLS.
--
-- The app connects as the database owner (store_rhimports), which bypasses
-- RLS — that is the old service-role path. Browser and anon-key requests
-- switch to rnh_anon / rnh_authenticated (lib/db/rls.ts) so the existing
-- Supabase policies apply unchanged. The cluster-wide anon/authenticated
-- roles are shared with other stores, so RNH gets its own.
--
-- Privileges mirror live Supabase (2026-10-28): full DML on public tables
-- (RLS does the filtering), DML on storage tables, and EXECUTE only on the
-- functions anon/authenticated could call there.
--
-- Idempotent. Run as postgres against the target database:
--   psql -v ON_ERROR_STOP=1 -v app_role=store_rhimports -d <db> -f 01_rls_roles.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rnh_anon') THEN
    CREATE ROLE rnh_anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rnh_authenticated') THEN
    CREATE ROLE rnh_authenticated NOLOGIN NOINHERIT;
  END IF;
END
$$;

GRANT rnh_anon, rnh_authenticated TO :"app_role";

-- Only the app role may connect to this database.
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_role') \gexec

GRANT USAGE ON SCHEMA public, auth, storage, extensions TO rnh_anon, rnh_authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public TO rnh_anon, rnh_authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rnh_anon, rnh_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO rnh_anon, rnh_authenticated;

-- Tables created later by the app role get the same grants (Supabase default privileges).
ALTER DEFAULT PRIVILEGES FOR ROLE :"app_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO rnh_anon, rnh_authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE :"app_role" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rnh_anon, rnh_authenticated;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt(), auth.email() TO rnh_anon, rnh_authenticated;

-- Function privileges exactly as on live (lock_down_sensitive_rpcs migration).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO rnh_anon, rnh_authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO rnh_anon, rnh_authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_customer_from_order(text, text, text, text, text, uuid, jsonb)
  TO rnh_anon, rnh_authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(text, text) TO rnh_authenticated;

-- Policies written "TO anon" / "TO authenticated" on Supabase now name the RNH roles.
DO $$
DECLARE
  pol record;
  new_roles text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, roles
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND roles && ARRAY['anon', 'authenticated']::name[]
  LOOP
    SELECT string_agg(
             quote_ident(CASE r WHEN 'anon' THEN 'rnh_anon'
                                WHEN 'authenticated' THEN 'rnh_authenticated'
                                ELSE r END), ', ')
      INTO new_roles
      FROM unnest(pol.roles) AS r
      WHERE r <> 'service_role';
    EXECUTE format('ALTER POLICY %I ON %I.%I TO %s',
                   pol.policyname, pol.schemaname, pol.tablename, new_roles);
  END LOOP;
END
$$;
