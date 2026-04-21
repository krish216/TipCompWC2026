-- Migration 040 — fix RLS on comp_admins and user_comps
-- These tables had policies causing infinite recursion (policies referencing each other)

-- ── comp_admins ──────────────────────────────────────────────────────────────
-- Drop ALL existing policies first
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'comp_admins' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.comp_admins', r.policyname);
  END LOOP;
END $$;

-- Single safe policy: users can read their own rows only
CREATE POLICY "comp_admins_self_read" ON public.comp_admins
  FOR SELECT USING (auth.uid() = user_id);

-- Admins need insert/update — tournament admins use service role (bypasses RLS)
-- so no additional policies needed for writes

-- ── user_comps ───────────────────────────────────────────────────────────────
-- Drop any policy that references comp_admins (the recursion source)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'user_comps' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_comps', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "user_comps_self" ON public.user_comps
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Verify
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('comp_admins', 'user_comps')
ORDER BY tablename, policyname;

SELECT 'Migration 040 complete' AS status;
