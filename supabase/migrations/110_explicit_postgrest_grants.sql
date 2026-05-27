-- Migration 110 — explicit PostgREST grants on all public tables
--
-- From May 30 2026 Supabase no longer exposes new public-schema tables to the
-- Data API (PostgREST / supabase-js) by default. Existing projects are
-- unaffected until October 30 2026, but adding grants now future-proofs the
-- project and avoids a breaking change at the enforcement deadline.
--
-- This migration grants on every table currently in the public schema via a
-- dynamic loop, so it stays correct regardless of renames or drops.
-- Each future migration should include its own GRANT block per new table.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Also cover any sequences (used by serial / identity columns)
DO $$
DECLARE
  s text;
BEGIN
  FOR s IN
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO anon, authenticated', s);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', s);
  END LOOP;
END $$;

SELECT '110 complete — explicit PostgREST grants added to all public tables' AS status;
