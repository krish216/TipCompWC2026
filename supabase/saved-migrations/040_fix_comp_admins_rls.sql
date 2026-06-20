-- Migration 040 — fix comp_admins RLS so users can read their own rows
-- This is needed for the client-side CompAdminMenu check

-- Check existing policies
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'comp_admins';

-- Drop all existing and recreate clean
DROP POLICY IF EXISTS "comp_admins_self_read"   ON public.comp_admins;
DROP POLICY IF EXISTS "comp_admins_read"         ON public.comp_admins;
DROP POLICY IF EXISTS "org_admins_self"          ON public.comp_admins;
DROP POLICY IF EXISTS "comp_admin_read"          ON public.comp_admins;

-- Simple self-read: a user can see their own comp_admin rows
CREATE POLICY "comp_admins_self_read" ON public.comp_admins
  FOR SELECT USING (auth.uid() = user_id);

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'comp_admins';

SELECT 'Migration 040 complete' AS status;
